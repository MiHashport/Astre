import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const httpException: HttpException = exception;
      statusCode = httpException.getStatus();
      const responseBody = httpException.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
        error = httpException.name;
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        const resObj = responseBody as Record<string, any>;
        message = resObj.message ?? httpException.message;
        error = resObj.error ?? httpException.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
      message = exception.message || 'Internal server error';
      error = exception.name || 'Internal Server Error';
    } else {
      this.logger.error(`Unhandled exception: ${String(exception)}`);
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
