import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import { Response } from 'express'
import { ApiEnvelope, ApiErrorShape } from "../../shared/src";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter{
    catch(exception: unknown, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<Response>()
        const { status, error } = this.normalize(exception)
        const body: ApiEnvelope<never> = { ok: false, error }
        res.status(status).json(body)
    }

    private normalize(exception: unknown): { status: number; error: ApiErrorShape}{
        if(exception instanceof HttpException){
            const payload = exception.getResponse()
            const error: ApiErrorShape = typeof payload === 'object' && payload !== null && 'code' in payload 
                ? (payload as ApiErrorShape)
                : { code: 'HTTP_ERROR', message: exception.message }
            return { status: exception.getStatus(), error }
        }
        const message = exception instanceof Error ? exception.message: 'Невідома помилка'
        return { status: 500, error: { code: 'INTERNAL', message }}
    }
}