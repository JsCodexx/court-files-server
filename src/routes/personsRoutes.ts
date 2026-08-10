import { Router } from 'express';
import * as personsController from '../controllers/personsController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', personsController.list);
router.post('/', personsController.create);
router.patch('/:id', personsController.update);

export default router;
