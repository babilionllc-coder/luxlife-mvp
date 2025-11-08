import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline as streamPipeline } from 'node:stream/promises';

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';

if (!admin.apps.length) {
  admin.initializeApp();
}

const region = 'us-central1';
const { logger } = functions;

const ttsClient = new TextToSpeechClient();
ffmpeg.setFfmpegPath(ffmpegStatic as string);

type FirestoreDate = FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;

interface PipelineStage {
  state?: 'pending' | 'running' | 'complete' | 'failed';
  updatedAt?: FirestoreDate;
  message?: string | null;
  [key: string]: unknown;
}

interface GenerationStage extends PipelineStage {
  prompt?: string;
  replicate?: {
    predictionId: string;
    modelVersion?: string;
    status?: string;
    createdAt?: FirestoreDate;
    updatedAt?: FirestoreDate;
    output?: string[] | null;
    error?: string | null;
    getUrl?: string | null;
    cancelUrl?: string | null;
  };
}

interface OrderPipeline {
  receivedAt?: FirestoreDate;
  validation?: PipelineStage;
  generation?: GenerationStage;
}

interface OrderDocument {
  uid?: string;
  email?: string | null;
  status?: string;
  scene?: string;
  sceneId?: string;
  tagline?: string | null;
  sourcePath?: string;
  videoPath?: string | null;
  prompt?: string | null;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
  pipeline?: OrderPipeline;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'canceled' | 'failed';
  error?: string | null;
  urls?: {
    get?: string;
    cancel?: string;
  };
  output?: string[] | null;
}

const getReplicateConfig = () => {
  const config = functions.config();
  const token = process.env.REPLICATE_API_TOKEN || config?.replicate?.api_token;
  const modelVersion = process.env.REPLICATE_MODEL_VERSION || config?.replicate?.model_version;
  return {
    token,
    modelVersion,
  };
};

const buildBackgroundPrompt = (order: OrderDocument): string => {
  const base = 'luxury lifestyle cinematic background, 4k, ultra high definition, golden hour lighting, bokeh, elegant modern architecture, depth of field, film still';
  const scene = order.scene || order.sceneId;
  const tagline = order.tagline;
  const extras = [scene, tagline, order.prompt]
    .filter((value) => !!value && typeof value === 'string')
    .join(', ');

  if (!extras) {
    return base;
  }

  return `${base}, ${extras}`;
};

const createReplicatePrediction = async (params: {
  token: string;
  modelVersion: string;
  prompt: string;
}): Promise<ReplicatePrediction> => {
  const { token, modelVersion, prompt } = params;

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({
      version: modelVersion,
      input: {
        prompt,
        negative_prompt: 'blurry, distorted, low quality, text, watermark, signature',
        width: 1024,
        height: 576,
        num_outputs: 1,
        num_inference_steps: 30,
        scheduler: 'K_EULER',
        guidance_scale: 7.5,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate API error (${response.status}): ${errorText}`);
  }

  const prediction = (await response.json()) as ReplicatePrediction;
  return prediction;
};

const getDidConfig = () => {
  const config = functions.config();
  const apiKey = process.env.DID_API_KEY || config?.did?.api_key;
  return {
    apiKey,
  };
};

const getResendConfig = () => {
  const config = functions.config();
  const apiKey = process.env.RESEND_API_KEY || config?.resend?.api_key;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    config?.resend?.from_email ||
    'LuxLife <notifications@luxlifemvp.com>';
  const dashboardUrl =
    process.env.APP_DASHBOARD_URL || config?.app?.dashboard_url || 'https://luxlifemvp.com/dashboard';
  return {
    apiKey,
    fromEmail,
    dashboardUrl,
  };
};

const buildVoiceScript = (order: OrderDocument): string => {
  if (order.tagline && order.tagline.trim().length > 0) {
    return order.tagline.trim();
  }

  if (order.scene) {
    return `Hi, I'm living the LuxLife in ${order.scene}.`;
  }

  return "Living my best life with LuxLife's AI studio.";
};

const debitUserCredit = async (uid: string) => {
  const userRef = admin.firestore().collection('users').doc(uid);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await admin.firestore().runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new Error('user_profile_missing');
    }

    const data = userSnap.data() as { credits?: unknown };
    const currentCredits =
      typeof data.credits === 'number' ? data.credits : Number(data.credits ?? 0);

    if (!Number.isFinite(currentCredits) || currentCredits <= 0) {
      throw new Error('insufficient_credits');
    }

    tx.update(userRef, {
      credits: currentCredits - 1,
      updatedAt: timestamp,
    });
  });
};

const creditUser = async (uid: string) => {
  const userRef = admin.firestore().collection('users').doc(uid);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await admin
    .firestore()
    .runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        return;
      }

      const data = userSnap.data() as { credits?: unknown };
      const currentCredits =
        typeof data.credits === 'number' ? data.credits : Number(data.credits ?? 0);

      const nextCredits = Number.isFinite(currentCredits) ? currentCredits + 1 : 1;

      tx.update(userRef, {
        credits: nextCredits,
        updatedAt: timestamp,
      });
    })
    .catch((error) => {
      logger.warn('Failed to refund credit', { uid, error: (error as Error).message });
    });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForReplicatePrediction = async (params: {
  token: string;
  prediction: ReplicatePrediction;
  orderId: string;
}) => {
  const { token, prediction, orderId } = params;
  let current = prediction;
  const getUrl = current.urls?.get;
  if (!getUrl) {
    throw new Error('replicate_missing_get_url');
  }

  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (current.status === 'succeeded' || current.status === 'failed' || current.status === 'canceled') {
      break;
    }

    await sleep(Math.min(5000, 1000 + attempt * 1000));

    const response = await fetch(getUrl, {
      headers: {
        Authorization: `Token ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('Replicate polling failed', { orderId, status: response.status, body: errorText });
      continue;
    }

    current = (await response.json()) as ReplicatePrediction;
  }

  return current;
};

const ensureDir = async (filePath: string) => {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
};

const downloadFile = async (url: string, destination: string) => {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`failed_to_download ${url} status=${response.status}`);
  }

  await ensureDir(destination);
  const writable = fs.createWriteStream(destination);
  await streamPipeline(response.body as unknown as NodeJS.ReadableStream, writable);
  return destination;
};

const composeFinalVideo = async (params: {
  orderId: string;
  backgroundUrl?: string | null;
  animationUrl: string;
  audioPath: string;
}) => {
  const { orderId, backgroundUrl, animationUrl, audioPath } = params;
  const tmpDir = os.tmpdir();
  const animationLocalPath = path.join(tmpDir, `${orderId}-animation.mp4`);
  let backgroundLocalPath: string | null = null;
  const finalLocalPath = path.join(tmpDir, `${orderId}-composed.mp4`);

  await downloadFile(animationUrl, animationLocalPath);

  const ffmpegCommand = ffmpeg();

  if (backgroundUrl) {
    backgroundLocalPath = path.join(tmpDir, `${orderId}-background.mp4`);
    await downloadFile(backgroundUrl, backgroundLocalPath);
    ffmpegCommand.input(backgroundLocalPath).input(animationLocalPath);

    ffmpegCommand.complexFilter([
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setpts=PTS-STARTPTS[bg]',
      '[1:v]scale=720:-1,setsar=1,setpts=PTS-STARTPTS[face]',
      '[bg][face]overlay=(W-w)/2:(H-h)/3:enable=between(t,0,15)[video]',
    ]);
    ffmpegCommand.outputOptions(['-map [video]']);
  } else {
    ffmpegCommand.input(animationLocalPath);
  }

  ffmpegCommand.input(audioPath);
  ffmpegCommand.outputOptions([
    '-map 1:a?',
    '-c:v libx264',
    '-preset veryfast',
    '-crf 21',
    '-c:a aac',
    '-b:a 192k',
    '-movflags +faststart',
    '-shortest',
  ]);

  ffmpegCommand.on('error', (error: Error) => {
    throw error;
  });

  await new Promise<void>((resolve, reject) => {
    ffmpegCommand
      .output(finalLocalPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });

  await safeUnlink(animationLocalPath);
  if (backgroundLocalPath) {
    await safeUnlink(backgroundLocalPath);
  }
  return finalLocalPath;
};

const sendResendEmail = async (params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) => {
  const { to, subject, text, html } = params;
  const { apiKey, fromEmail } = getResendConfig();
  if (!apiKey) {
    logger.warn('Resend API key missing; email skipped', { to, subject });
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`resend_email_error_${response.status}: ${errorText}`);
  }
};

const notifyOrderStatus = async (params: {
  email?: string | null;
  orderId: string;
  status: 'complete' | 'failed';
  videoUrl?: string | null;
  errorMessage?: string | null;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  fallbackStrategy?: string | null;
}) => {
  const { email, orderId, status, videoUrl, errorMessage } = params;
  if (!email) {
    return;
  }

  const { dashboardUrl } = getResendConfig();

  if (status === 'complete' && videoUrl) {
    const { fallbackUsed, fallbackReason, fallbackStrategy } = params;
    const subject = fallbackUsed
      ? '🎬 Your LuxLife video is ready (delivered with fallback)'
      : '🎬 Your LuxLife video is ready';

    const textLines = [
      `Your LuxLife order ${orderId} is complete!`,
    ];

    if (fallbackUsed) {
      const strategyText =
        fallbackStrategy === 'animation_only'
          ? 'We delivered the animated portrait while the background generator was unavailable.'
          : 'We delivered your clip using our fallback pipeline.';
      textLines.push(strategyText);
      if (fallbackReason) {
        textLines.push(`Reason: ${fallbackReason}`);
      }
    }

    textLines.push(
      `Download your video here: ${videoUrl}`,
      `You can also view all of your orders at ${dashboardUrl}.`,
      '',
      'Enjoy your cinematic moment ✨',
    );

    const text = textLines.join('\n');

    const fallbackDetail = fallbackUsed
      ? `<p>We used a fallback path to deliver your clip while the background generator was unavailable.${
          fallbackReason ? ` Reason: ${fallbackReason}.` : ''
        }</p>`
      : '';

    const html = `
      <p>Hey there!</p>
      <p>Your LuxLife order <strong>${orderId}</strong> is complete.</p>
      ${fallbackDetail}
      <p><a href="${videoUrl}" target="_blank" rel="noopener">Download your video</a></p>
      <p>You can revisit all of your orders anytime in the <a href="${dashboardUrl}" target="_blank" rel="noopener">LuxLife dashboard</a>.</p>
      <p>Enjoy your cinematic moment ✨</p>
    `;

    try {
      await sendResendEmail({ to: email, subject, text, html });
    } catch (error) {
      logger.warn('Failed to send completion email', {
        orderId,
        email,
        error: (error as Error).message,
      });
    }
    return;
  }

  if (status === 'failed') {
    const subject = 'LuxLife update: your video needs attention';
    const text = [
      `We couldn't finish LuxLife order ${orderId}.`,
      errorMessage ? `Details: ${errorMessage}` : 'No additional error details were provided.',
      'Your credit has been refunded automatically.',
      `When you’re ready, visit ${dashboardUrl} to try again.`,
    ].join('\n');

    const html = `
      <p>Hi there,</p>
      <p>We hit a snag while generating your LuxLife order <strong>${orderId}</strong>.</p>
      <p>${errorMessage ? `Details: ${errorMessage}` : 'No additional error details were provided.'}</p>
      <p>Your credit has been refunded to your account. When you’re ready, <a href="${dashboardUrl}" target="_blank" rel="noopener">head back to the dashboard</a> to try again.</p>
      <p>If the issue persists, just reply to this email and we’ll help right away.</p>
    `;

    try {
      await sendResendEmail({ to: email, subject, text, html });
    } catch (error) {
      logger.warn('Failed to send failure email', {
        orderId,
        email,
        error: (error as Error).message,
      });
    }
  }
};

const synthesizeVoiceover = async (text: string, destination: string) => {
  const [result] = await ttsClient.synthesizeSpeech({
    input: {
      text,
    },
    voice: {
      languageCode: 'en-US',
      ssmlGender: 'FEMALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.96,
    },
  });

  if (!result.audioContent) {
    throw new Error('tts_empty_audio');
  }

  await ensureDir(destination);
  await fsp.writeFile(destination, result.audioContent, 'binary');
  return destination;
};

const uploadFileWithToken = async (localPath: string, destination: string, contentType: string) => {
  const bucket = admin.storage().bucket();
  const token = uuidv4();
  await bucket.upload(localPath, {
    destination,
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const encodedPath = encodeURIComponent(destination);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
};

interface DidTalkResponse {
  id: string;
  status: 'created' | 'started' | 'processing' | 'done' | 'error';
  result_url?: string;
  error?: string;
}

const createDidTalk = async (params: {
  apiKey: string;
  imageUrl: string;
  audioUrl: string;
  orderId: string;
}) => {
  const { apiKey, imageUrl, audioUrl, orderId } = params;
  const response = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    },
    body: JSON.stringify({
      script: {
        type: 'audio',
        audio_url: audioUrl,
      },
      source_url: imageUrl,
      config: {
        result_format: 'mp4',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`did_create_failed ${orderId} ${errorText}`);
  }

  return (await response.json()) as DidTalkResponse;
};

const waitForDidResult = async (params: { apiKey: string; talkId: string; orderId: string }) => {
  const { apiKey, talkId, orderId } = params;
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`https://api.d-id.com/talks/${talkId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('Failed fetching D-ID talk status', { orderId, status: response.status, body: errorText });
      await sleep(2000);
      continue;
    }

    const talk = (await response.json()) as DidTalkResponse;
    if (talk.status === 'done' || talk.status === 'error') {
      return talk;
    }

    await sleep(3000);
  }

  throw new Error('did_timeout');
};

const safeUnlink = async (filePath: string) => {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('Failed to cleanup temp file', { filePath, error });
    }
  }
};

export const ping = functions.region(region).https.onRequest((_req, res) => {
  res.status(200).json({ ok: true, message: 'LuxLife Functions ready.' });
});

export const onOrderCreated = functions
  .region(region)
  .firestore.document('orders/{orderId}')
  .onCreate(async (snapshot, context) => {
    const orderId = context.params.orderId as string;
    const data = snapshot.data() as OrderDocument | undefined;

    if (!data) {
      logger.error('Order created with no data payload', { orderId });
      return;
    }

    const requiredFields: Array<keyof OrderDocument> = ['uid', 'sourcePath'];
    const missingFields = requiredFields.filter((field) => {
      const value = data[field];
      return value === undefined || value === null || value === '';
    });

    const orderRef = snapshot.ref;
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

    if (missingFields.length > 0) {
      logger.warn('Order missing required fields', { orderId, missingFields });

      await orderRef.update({
        status: 'failed',
        errorCode: 'validation_missing_fields',
        errorMessage: `Order is missing required fields: ${missingFields.join(', ')}`,
        updatedAt: serverTimestamp,
      });

      return;
    }

    try {
      await debitUserCredit(data.uid as string);
    } catch (error) {
      const errorCode =
        error instanceof Error && error.message === 'insufficient_credits'
          ? 'insufficient_credits'
          : 'user_profile_missing';
      const errorMessage =
        errorCode === 'insufficient_credits'
          ? 'Not enough credits to start generation. Purchase more to continue.'
          : 'User profile missing credits configuration.';

      logger.warn('Failed to reserve credit for order', { orderId, error: errorCode });

      await orderRef.update({
        status: 'failed',
        errorCode,
        errorMessage,
        updatedAt: serverTimestamp,
      });

      await notifyOrderStatus({
        email: data.email,
        orderId,
        status: 'failed',
        errorMessage,
      });

      return;
    }

    logger.info('Order received. Queued for validation.', {
      orderId,
      uid: data.uid,
      sceneId: data.sceneId,
    });

    await orderRef.update({
      status: 'queued_validation',
      pipeline: {
        receivedAt: serverTimestamp,
        validation: {
          state: 'running',
          updatedAt: serverTimestamp,
        },
      },
      updatedAt: serverTimestamp,
    });

    try {
      const sourcePath = data.sourcePath as string;
      const bucket = admin.storage().bucket();
      const file = bucket.file(sourcePath);
      const [exists] = await file.exists();

      if (!exists) {
        logger.warn('Order source file not found in storage', { orderId, sourcePath });
        await creditUser(data.uid as string);
        await orderRef.update({
          status: 'failed',
          errorCode: 'validation_missing_file',
          errorMessage: `Source file ${sourcePath} not found in storage.`,
          'pipeline.validation': {
            state: 'failed',
            updatedAt: serverTimestamp,
            message: 'Source file missing from storage.',
          },
          updatedAt: serverTimestamp,
        });
        await notifyOrderStatus({
          email: data.email,
          orderId,
          status: 'failed',
          errorMessage: 'Portrait upload was missing. Please retry the upload.',
        });
        return;
      }

      logger.info('Order validation complete; queued for generation', { orderId, sourcePath });

      await orderRef.update({
        status: 'queued_generation',
        'pipeline.validation': {
          state: 'complete',
          updatedAt: serverTimestamp,
        },
        updatedAt: serverTimestamp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown validation error';
      logger.error('Validation stage failed', { orderId, error: message });
      await creditUser(data.uid as string);

      await orderRef.update({
        status: 'failed',
        errorCode: 'validation_error',
        errorMessage: message,
        'pipeline.validation': {
          state: 'failed',
          updatedAt: serverTimestamp,
          message,
        },
        updatedAt: serverTimestamp,
      });

      await notifyOrderStatus({
        email: data.email,
        orderId,
        status: 'failed',
        errorMessage: message,
      });
    }
  });

export const onOrderQueuedGeneration = functions
  .region(region)
  .firestore.document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const orderId = context.params.orderId as string;
    const beforeData = change.before.data() as OrderDocument | undefined;
    const afterData = change.after.data() as OrderDocument | undefined;

    if (!afterData) {
      logger.error('Order update without data payload', { orderId });
      return;
    }

    if (afterData.status !== 'queued_generation') {
      return;
    }

    if (beforeData?.status === 'queued_generation') {
      return;
    }

    const orderRef = change.after.ref;
    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
    const uid = afterData.uid;
    if (!uid) {
      logger.error('Order missing uid during generation', { orderId });
      return;
    }

    const { token: replicateToken, modelVersion } = getReplicateConfig();
    if (!replicateToken || !modelVersion) {
      logger.error('Replicate configuration missing', {
        orderId,
        hasToken: !!replicateToken,
        hasModelVersion: !!modelVersion,
      });
      await creditUser(uid);
      await orderRef.update({
        status: 'failed',
        errorCode: 'generation_config_missing',
        errorMessage: 'Replicate configuration missing. Please set API token and model version.',
        'pipeline.generation.state': 'failed',
        'pipeline.generation.updatedAt': serverTimestamp,
        updatedAt: serverTimestamp,
      });
      return;
    }

    const { apiKey: didApiKey } = getDidConfig();
    if (!didApiKey) {
      logger.error('D-ID configuration missing', { orderId });
      await creditUser(uid);
      await orderRef.update({
        status: 'failed',
        errorCode: 'generation_animation_config_missing',
        errorMessage: 'D-ID API key missing. Configure DID_API_KEY to enable animation.',
        'pipeline.generation.state': 'failed',
        'pipeline.generation.updatedAt': serverTimestamp,
        updatedAt: serverTimestamp,
      });
      return;
    }

    const prompt = buildBackgroundPrompt(afterData);
    const bucket = admin.storage().bucket();
    const tempFiles: string[] = [];
    let replicateStatus: string = 'skipped';
    let replicateError: string | null = null;
    let replicateOutput: string[] | null = null;
    let replicatePredictionId: string | null = null;
    let replicateGetUrl: string | null = null;
    let replicateCancelUrl: string | null = null;
    let backgroundUrl: string | null = null;
    let fallbackUsed = false;
    let fallbackReasonCode: string | null = null;
    let fallbackReasonMessage: string | null = null;
    let fallbackDetails: string | null = null;

    try {
      await orderRef.update({
        status: 'generating_background',
        updatedAt: serverTimestamp,
        'pipeline.generation.state': 'running',
        'pipeline.generation.updatedAt': serverTimestamp,
        'pipeline.generation.prompt': prompt,
        'pipeline.generation.fallback': {
          used: false,
          reasonCode: null,
          reason: null,
          details: null,
          strategy: null,
          updatedAt: serverTimestamp,
        },
      });

      logger.info('Starting background generation via Replicate', {
        orderId,
        modelVersion,
      });

      let predictionResult: ReplicatePrediction | null = null;

      try {
        const prediction = await createReplicatePrediction({
          token: replicateToken,
          modelVersion,
          prompt,
        });

        logger.info('Replicate prediction created', {
          orderId,
          predictionId: prediction.id,
          status: prediction.status,
        });

        replicatePredictionId = prediction.id;
        replicateStatus = prediction.status;
        replicateOutput = prediction.output ?? null;
        replicateError = prediction.error ?? null;
        replicateGetUrl = prediction.urls?.get ?? null;
        replicateCancelUrl = prediction.urls?.cancel ?? null;

        await orderRef.update({
          'pipeline.generation.replicate': {
            predictionId: prediction.id,
            modelVersion,
            status: prediction.status,
            createdAt: serverTimestamp,
            updatedAt: serverTimestamp,
            output: prediction.output ?? null,
            error: prediction.error ?? null,
            getUrl: replicateGetUrl,
            cancelUrl: replicateCancelUrl,
          },
        });

        predictionResult = await waitForReplicatePrediction({
          token: replicateToken,
          prediction,
          orderId,
        });

        replicatePredictionId = predictionResult.id ?? replicatePredictionId;
        replicateStatus = predictionResult.status;
        replicateOutput = predictionResult.output ?? null;
        replicateError = predictionResult.error ?? null;
        replicateGetUrl = predictionResult.urls?.get ?? replicateGetUrl;
        replicateCancelUrl = predictionResult.urls?.cancel ?? replicateCancelUrl;

        if (predictionResult.status !== 'succeeded' || !predictionResult.output?.length) {
          const message =
            predictionResult.error ?? 'Replicate did not return a successful result.';
          throw new Error(message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Replicate error';
        replicateStatus = 'failed';
        replicateError = message;
        fallbackUsed = true;
        fallbackReasonCode = message.includes('402')
          ? 'replicate_insufficient_credits'
          : 'replicate_generation_failed';
        fallbackReasonMessage =
          fallbackReasonCode === 'replicate_insufficient_credits'
            ? 'Background generator credits are currently exhausted.'
            : 'Background generator unavailable; delivered animation-only.';
        fallbackDetails = message;
        logger.warn('Replicate generation failed; continuing with fallback animation', {
          orderId,
          error: message,
        });
      }

      if (replicateStatus !== 'failed' && replicateOutput && replicateOutput.length > 0) {
        const firstOutput = replicateOutput[0];
        if (typeof firstOutput === 'string' && /\.(mp4|mov|webm|mkv)$/i.test(firstOutput)) {
          backgroundUrl = firstOutput;
        } else {
          backgroundUrl = null;
          fallbackUsed = true;
          fallbackReasonCode = 'replicate_returned_image';
          fallbackReasonMessage = 'Background generator returned a still image.';
          fallbackDetails = typeof firstOutput === 'string' ? firstOutput : 'Non-video output.';
          logger.info('Replicate returned non-video output; using fallback animation delivery', {
            orderId,
            predictionId: replicatePredictionId,
            output: firstOutput,
          });
        }
      } else {
        backgroundUrl = null;
      }

      replicateStatus = replicateStatus === 'failed' && !fallbackUsed ? 'failed' : replicateStatus;

      await orderRef.update({
        status: 'processing',
        updatedAt: serverTimestamp,
        'pipeline.generation.replicate': {
          predictionId: replicatePredictionId,
          modelVersion,
          status: replicateStatus,
          updatedAt: serverTimestamp,
          output: replicateOutput,
          error: replicateError,
          getUrl: replicateGetUrl,
          cancelUrl: replicateCancelUrl,
        },
        'pipeline.generation.fallback': fallbackUsed
          ? {
              used: true,
              reasonCode: fallbackReasonCode,
              reason: fallbackReasonMessage,
              details: fallbackDetails,
              strategy: 'animation_only',
              updatedAt: serverTimestamp,
            }
          : {
              used: false,
              reasonCode: null,
              reason: null,
              details: null,
              strategy: null,
              updatedAt: serverTimestamp,
            },
      });

      const voiceScript = buildVoiceScript(afterData);
      const voiceLocalPath = path.join(os.tmpdir(), `${orderId}-voice.mp3`);
      tempFiles.push(voiceLocalPath);
      await synthesizeVoiceover(voiceScript, voiceLocalPath);

      const audioStoragePath = `videos/${uid}/${orderId}/voice.mp3`;
      await uploadFileWithToken(voiceLocalPath, audioStoragePath, 'audio/mpeg');
      const [audioSignedUrl] = await bucket
        .file(audioStoragePath)
        .getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });

      await orderRef.update({
        'pipeline.generation.voice': {
          state: 'complete',
          updatedAt: serverTimestamp,
          script: voiceScript,
          storagePath: audioStoragePath,
        },
        updatedAt: serverTimestamp,
      });

      const sourcePath = afterData.sourcePath as string;
      const [imageSignedUrl] = await bucket
        .file(sourcePath)
        .getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });

      const talk = await createDidTalk({
        apiKey: didApiKey,
        imageUrl: imageSignedUrl,
        audioUrl: audioSignedUrl,
        orderId,
      });

      await orderRef.update({
        'pipeline.generation.animation': {
          state: 'running',
          updatedAt: serverTimestamp,
          talkId: talk.id,
        },
        updatedAt: serverTimestamp,
      });

      const talkResult = await waitForDidResult({
        apiKey: didApiKey,
        talkId: talk.id,
        orderId,
      });

      if (talkResult.status !== 'done' || !talkResult.result_url) {
        throw new Error(talkResult.error ?? 'did_generation_failed');
      }

      const composedLocalPath = await composeFinalVideo({
        orderId,
        backgroundUrl,
        animationUrl: talkResult.result_url,
        audioPath: voiceLocalPath,
      });
      tempFiles.push(composedLocalPath);

      const finalStoragePath = `videos/${uid}/${orderId}/final.mp4`;
      const finalVideoUrl = await uploadFileWithToken(composedLocalPath, finalStoragePath, 'video/mp4');

      const updatePayload: Record<string, unknown> = {
        status: 'complete',
        videoPath: finalVideoUrl,
        updatedAt: serverTimestamp,
        'pipeline.generation.state': 'complete',
        'pipeline.generation.updatedAt': serverTimestamp,
        'pipeline.generation.animation.state': 'complete',
        'pipeline.generation.animation.updatedAt': serverTimestamp,
        'pipeline.generation.animation.talkId': talkResult.id,
        'pipeline.generation.animation.resultUrl': talkResult.result_url,
        'pipeline.generation.replicate.status': replicateStatus,
        'pipeline.generation.replicate.updatedAt': serverTimestamp,
        'pipeline.generation.replicate.output': replicateOutput,
        'pipeline.generation.replicate.error': replicateError,
        'pipeline.generation.replicate.getUrl': replicateGetUrl,
        'pipeline.generation.replicate.cancelUrl': replicateCancelUrl,
        'pipeline.generation.replicate.modelVersion': modelVersion,
      };

      if (replicatePredictionId) {
        updatePayload['pipeline.generation.replicate.predictionId'] = replicatePredictionId;
      }

      if (fallbackUsed) {
        Object.assign(updatePayload, {
          'pipeline.generation.fallback.used': true,
          'pipeline.generation.fallback.reasonCode': fallbackReasonCode,
          'pipeline.generation.fallback.reason': fallbackReasonMessage,
          'pipeline.generation.fallback.details': fallbackDetails,
          'pipeline.generation.fallback.strategy': 'animation_only',
          'pipeline.generation.fallback.updatedAt': serverTimestamp,
        });
      } else {
        Object.assign(updatePayload, {
          'pipeline.generation.fallback.used': false,
          'pipeline.generation.fallback.reasonCode': null,
          'pipeline.generation.fallback.reason': null,
          'pipeline.generation.fallback.details': null,
          'pipeline.generation.fallback.strategy': null,
          'pipeline.generation.fallback.updatedAt': serverTimestamp,
        });
      }

      await orderRef.update(updatePayload);

      await notifyOrderStatus({
        email: afterData.email,
        orderId,
        status: 'complete',
        videoUrl: finalVideoUrl,
        fallbackUsed,
        fallbackReason: fallbackReasonMessage,
        fallbackStrategy: fallbackUsed ? 'animation_only' : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Replicate error';
      logger.error('Generation pipeline failed', {
        orderId,
        error: message,
      });
      await creditUser(uid);
      await orderRef.update({
        status: 'failed',
        errorCode: 'generation_pipeline_error',
        errorMessage: message,
        'pipeline.generation.state': 'failed',
        'pipeline.generation.updatedAt': serverTimestamp,
        updatedAt: serverTimestamp,
      });

      await notifyOrderStatus({
        email: afterData.email,
        orderId,
        status: 'failed',
        errorMessage: message,
      });
    } finally {
      await Promise.all(tempFiles.map((file) => safeUnlink(file)));
    }
  });
