import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const { fieldErrors, formErrors } = result.error.flatten();
      // Errors from a whole-object rule (e.g. "phone or email") have no field,
      // so without this they would come back as an empty object.
      throw new BadRequestException(formErrors.length > 0 ? { ...fieldErrors, form: formErrors } : fieldErrors);
    }
    return result.data;
  }
}
