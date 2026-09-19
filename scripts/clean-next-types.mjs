import { rmSync } from 'node:fs';

for (const dir of ['.next/types', '.next/dev/types']) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
