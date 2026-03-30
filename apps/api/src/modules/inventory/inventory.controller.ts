import { Controller, Get, Query } from '@nestjs/common';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('listing')
  list(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.listInventoryForBuyers(query);
  }
}
