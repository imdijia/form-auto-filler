/**
 * Contract barrel. The four *.ts mirrors in this directory are byte-for-byte
 * copies of docs/contracts/* (verified by scripts/check-contracts.mjs).
 * Dependency direction is one way only: interfaces -> field -> rules -> types.
 * Do not declare a second field-type enum here.
 */
export * from './types';
export * from './rules';
export * from './field';
export * from './interfaces';
export * from './field-metadata';
