import { readFileSync } from 'node:fs';

function firstFunction(): void {
  console.log('line 4');
}

function secondFunction(): void {
  const x = 42;
  const y = x * 2;
  console.log(y);
}

function thirdFunction(): void {
  for (let i = 0; i < 100; i++) {
    Math.sqrt(i);
  }
}
