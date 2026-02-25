import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 191)
  tenantId?: string;
}
