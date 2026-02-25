import {
  IsEmail,
  IsObject,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VendorAdminDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VendorCompanyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  country!: string;

  @IsString()
  @MinLength(2)
  currency!: string;
}

export class VendorStoreDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsString()
  @MinLength(2)
  country!: string;

  @IsString()
  @MinLength(2)
  timezone!: string;
}

export class VendorSignupDto {
  @IsObject()
  @ValidateNested()
  @Type(() => VendorAdminDto)
  admin!: VendorAdminDto;

  @IsObject()
  @ValidateNested()
  @Type(() => VendorCompanyDto)
  company!: VendorCompanyDto;

  @IsObject()
  @ValidateNested()
  @Type(() => VendorStoreDto)
  store!: VendorStoreDto;
}
