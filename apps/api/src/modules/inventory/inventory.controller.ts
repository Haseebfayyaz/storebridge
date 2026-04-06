import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('listing')
  list(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.listInventoryForBuyers(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.inventoryService.getInventoryDetail(id);
  }

  @Get(':id/similar')
  similar(@Param('id') id: string) {
    return this.inventoryService.getSimilarItemsByCategory(id);
  }
}
