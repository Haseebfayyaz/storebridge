import { IsString, Length } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(1, 191)
  tenantId!: string;

  @IsString()
  @Length(2, 100)
  city!: string;

  @IsString()
  @Length(2, 100)
  country!: string;

  @IsString()
  @Length(2, 100)
  timezone!: string;
}
