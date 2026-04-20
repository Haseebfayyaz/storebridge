import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  inventoryId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
