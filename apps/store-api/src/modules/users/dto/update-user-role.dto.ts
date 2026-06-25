import { IsOptional, IsString } from 'class-validator';

export class UpdateUserRoleDto {
  @IsString()
  roleId!: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
