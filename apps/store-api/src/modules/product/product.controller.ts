import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { CurrentUser } from 'common';
import { CreateFullItemDto } from './dto/create-full-item.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductService } from './product.service';

interface RequestUser {
  sub: string;
  tenantId: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.productService.createProduct(dto, user.tenantId);
  }

  @Patch('products/:id')
  updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productService.updateProduct(id, dto, user.tenantId);
  }

  @Post('products/:productId/variants')
  createVariant(
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productService.createVariant(productId, dto, user.tenantId);
  }

  @Patch('product-variants/:id')
  updateVariant(
    @Param('id') id: string,
    @Body() dto: UpdateProductVariantDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productService.updateVariant(id, dto, user.tenantId);
  }

  @Post('products/full-item')
  createFullItem(@Body() dto: CreateFullItemDto, @CurrentUser() user: RequestUser) {
    return this.productService.createFullItem(dto, user);
  }
}
