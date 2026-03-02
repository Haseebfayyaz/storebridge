import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { CreateProductVariantDto } from './create-product-variant.dto';

class CreateVariantInventoryDto {
  @IsString()
  storeId!: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  reservedQty?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStock?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  storePrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  storeCostPrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  storeMrp?: number;
}

class CreateFullItemVariantDto extends CreateProductVariantDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantInventoryDto)
  inventories?: CreateVariantInventoryDto[];
}

export class CreateFullItemDto {
  @ValidateNested()
  @Type(() => CreateProductDto)
  product!: CreateProductDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFullItemVariantDto)
  variants!: CreateFullItemVariantDto[];
}

export { CreateFullItemVariantDto, CreateVariantInventoryDto };
