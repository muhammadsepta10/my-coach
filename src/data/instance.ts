import { today } from '../coach/dates';
import { createCoach } from './coach';
import { db } from './db';

export const coach = createCoach(db, today);
