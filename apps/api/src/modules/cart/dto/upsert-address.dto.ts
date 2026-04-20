import { IsEmail, IsString } from 'class-validator';

export class UpsertAddressDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  street!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  zip!: string;

  @IsString()
  country!: string;

  @IsString()
  phone!: string;
}
