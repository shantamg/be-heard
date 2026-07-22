import { Router } from 'express';
import brainRoutes from './brain';
import authRoutes from './auth';
import consentRoutes from './consent';
import emotionsRoutes from './emotions';
import gratitudeRoutes from './gratitude';
import innerThoughtsRoutes from './inner-thoughts';
import invitationsRoutes from './invitations';
import meditationRoutes from './meditation';
import memoriesRoutes from './memories';
import needsAssessmentRoutes from './needs-assessment';
import peopleRoutes from './people';
import knowledgeBaseRoutes from './knowledge-base';
import reconcilerRoutes from './reconciler';
import sessionsRoutes from './sessions';
import stage0Routes from './stage0';
import messagesRoutes from './messages';
import notificationsRoutes from './notifications';
import stage2Routes from './stage2';
import stage3Routes from './stage3';
import stage4Routes from './stage4';
import tendingRoutes from './tending';
import ttsRoutes from './tts';
import voiceRoutes from './voice';
import e2eRoutes from './e2e';
import versionRoutes from './version';
import { logger } from '../lib/logger';

const router = Router();

logger.info('[Routes] Loading main router...');

// Mount all route modules
router.use('/brain', brainRoutes);
router.use(versionRoutes); // Public mobile app version check
router.use('/auth', authRoutes);
router.use('/tts', ttsRoutes);
router.use(voiceRoutes); // Voice transcription token endpoint
if (process.env.NODE_ENV !== 'production') {
  router.use('/e2e', e2eRoutes); // E2E testing helpers - must be BEFORE routers with global auth middleware
}
router.use(invitationsRoutes); // Must be before innerWorkRoutes (has public endpoints)
router.use(innerThoughtsRoutes); // Inner Thoughts (solo self-reflection, optionally linked to partner sessions)
router.use('/memories', memoriesRoutes); // Things to Always Remember
router.use('/needs', needsAssessmentRoutes); // Inner Work: Needs Assessment
router.use('/gratitude', gratitudeRoutes); // Inner Work: Gratitude Practice
router.use('/meditation', meditationRoutes); // Inner Work: Meditation
router.use('/people', peopleRoutes); // Inner Work: People Tracking
router.use(knowledgeBaseRoutes); // Knowledge Base browse endpoints
router.use(sessionsRoutes);
router.use(consentRoutes);
router.use(emotionsRoutes);
router.use(stage0Routes);
router.use(messagesRoutes);
router.use(stage2Routes);
router.use(notificationsRoutes); // Pending actions & badge counts
router.use(reconcilerRoutes); // Post-Stage 2 empathy gap analysis
router.use(stage3Routes);
router.use(stage4Routes);
router.use(tendingRoutes);

// Health check endpoint
router.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
