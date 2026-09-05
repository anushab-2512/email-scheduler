import path from 'path';
import { execSync } from 'child_process';

console.log('Running database seeding...');
execSync('npm run db:seed -w apps/backend', {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
});
