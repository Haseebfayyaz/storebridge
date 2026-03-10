import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';

export class ManageRolePermissionsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];

  @ValidateIf((o) => !o.permissionIds)
  @IsString()
  permissionId?: string;

  @ValidateIf((o) => o.permissionId !== undefined)
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;
}
