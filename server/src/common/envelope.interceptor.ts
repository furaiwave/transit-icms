import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";
import { ApiEnvelope } from "../../shared/src";

@Injectable()
export class EnvelopeInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>>{
    intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>>{
        return next.handle().pipe(map((data): ApiEnvelope<T> => ({ ok: true, data })))
    }
}