import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { CurrentUser } from 'common';
import { AdjustReserveStockDto } from './dto/adjust-reserve-stock.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryService } from './inventory.service';

interface RequestUser {
  sub: string;
  tenantId: string | null;
}

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(@Body() dto: CreateInventoryDto, @CurrentUser() user: RequestUser) {
    return this.inventoryService.createInventory(dto, user.sub, user.tenantId);
  }

  @Get('store/:storeId/variant/:variantId')
  findByStoreAndVariant(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.inventoryService.getStoreVariantInventoryWithPricing(
      storeId,
      variantId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryService.getInventoryWithPricing(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateStock(id, dto, user.sub);
  }

  @Patch(':id/delete')
  softDelete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.softDeleteInventory(id, user.sub);
  }

  @Patch(':id/reserve')
  reserve(
    @Param('id') id: string,
    @Body() dto: AdjustReserveStockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.reserveStock(id, dto.quantity, user.sub);
  }

  @Patch(':id/release')
  release(
    @Param('id') id: string,
    @Body() dto: AdjustReserveStockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.releaseReservedStock(id, dto.quantity, user.sub);
  }
}
