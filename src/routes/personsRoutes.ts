import { Router } from 'express';
import * as personsController from '../controllers/personsController';
import { requireAuth } from '../middleware/auth';
import { requireAppAccess } from '../middleware/appAccess';

const router = Router();

router.use(requireAuth());
router.use(requireAppAccess());

router.get('/', personsController.list);
router.post('/', personsController.create);
router.patch('/:id', personsController.update);

export default router;
