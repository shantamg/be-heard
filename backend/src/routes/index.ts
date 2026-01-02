import { Router } from 'express';
import authRoutes from './auth';
import chatRoutes from './chat';
import consentRoutes from './consent';
import emotionsRoutes from './emotions';
import innerWorkRoutes from './inner-work';
import invitationsRoutes from './invitations';
import sessionsRoutes from './sessions';
import stage0Routes from './stage0';
import stage1Routes from './stage1';
import stage2Routes from './stage2';
import stage3Routes from './stage3';
import stage4Routes from './stage4';

const router = Router();

// Mount all route modules
router.use('/auth', authRoutes);
router.use(chatRoutes); // Unified chat router
router.use(invitationsRoutes); // Must be before innerWorkRoutes (has public endpoints)
router.use(innerWorkRoutes); // Inner work (solo self-reflection)
router.use(sessionsRoutes);
router.use(consentRoutes);
router.use(emotionsRoutes);
router.use(stage0Routes);
router.use(stage1Routes);
router.use(stage2Routes);
router.use(stage3Routes);
router.use(stage4Routes);

// Health check endpoint
router.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
