import { NotImplementedError } from '../errors.mjs';

export async function createRedisStore() {
  throw new NotImplementedError('Redis storage driver is not implemented in this scaffold.');
}
