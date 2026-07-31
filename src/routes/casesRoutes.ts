import { Router } from 'express';
import * as casesController from '../controllers/casesController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', casesController.list);
router.get('/today', casesController.today);
router.get('/tomorrow', casesController.tomorrow);
router.get('/hearing-dates', casesController.hearingDates);
router.get('/search', casesController.search);
router.get('/by-date', casesController.byDate);
router.get('/category/:category', casesController.byCategory);
router.get('/:id', casesController.getOne);
router.post('/', casesController.create);
router.patch('/:id', casesController.update);
router.post('/:id/hearings', casesController.addHearing);
router.patch('/:id/hearings/:hearingId', casesController.updateHearing);
router.delete('/:id/hearings/:hearingId', casesController.removeHearing);
router.delete('/:id', casesController.remove);

export default router;
