import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { AppRole } from 'models';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(AppRole)
  role!: AppRole;
}
