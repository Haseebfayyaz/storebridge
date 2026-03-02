import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  taxClassId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
