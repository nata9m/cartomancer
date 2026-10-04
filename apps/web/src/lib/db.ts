import 'server-only';
import { getPrisma as getSharedPrisma } from '@cartomancer/db';

/**
 * The web app's database client (#62), with the pool this app actually needs.
 *
 * Sessions are JWTs, so the database is touched only by the Auth.js adapter at
 * sign-in and by the account actions: a handful of short queries, never a
 * request's worth of them. Three connections is plenty, against the ten
 * node-postgres would otherwise hold open per replica — which, multiplied by
 * replicas, is where the connection budget goes. `DATABASE_POOL_MAX` overrides it.
 *
 * Every import of the client in this app goes through here, and has to: the
 * client is created once, by whichever call comes first, so a second caller
 * passing different options would not change a pool that already exists.
 */
export const getPrisma = () => getSharedPrisma({ pool: { max: 3 } });
