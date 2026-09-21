import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/helpers';
import { logger } from '../lib/logger';

function isPrismaTransactionTimeout(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError
    && err.code === 'P2028'
  );
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  if (isPrismaTransactionTimeout(err)) {
    res.status(504).json({
      error: 'Operation timed out. Please try again.',
      code: 'TRANSACTION_TIMEOUT',
    });
    return;
  }

  logger.error('Unhandled request error', {
    method: req.method,
    path: req.path,
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  res.status(500).json({ error: 'Internal server error' });
}
