import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { z } from "zod";

@Injectable()
export class ZodValidationPipe<S extends z.ZodTypeAny> implements PipeTransform<unknown, z.output<S>>{
    constructor(private readonly schema: S) {}

    transform(value: unknown): z.output<S> {
        const parsed = this.schema.safeParse(value)
        if(!parsed.success){
            throw new BadRequestException({
                code: 'VALIDATION_FAILED',
                message: 'Тіло запиту не відповідає контракту',
                details: parsed.error.flatten()
            })
        }
        return parsed.data
    }
}