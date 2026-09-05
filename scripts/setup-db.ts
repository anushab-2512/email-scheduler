import path from 'path';
import { execSync } from 'child_process';

console.log('Running database migrations...');
execSync('npm run db:migrate -w apps/backend', {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
});
