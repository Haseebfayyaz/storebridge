import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { CurrentUser } from 'common';
import { CreateTaxClassDto } from './dto/create-tax-class.dto';
import { UpdateTaxClassDto } from './dto/update-tax-class.dto';
import { TaxClassService } from './tax-class.service';

interface RequestUser {
  tenantId: string | null;
}

@Controller('tax-classes')
@UseGuards(JwtAuthGuard)
export class TaxClassController {
  constructor(private readonly taxClassService: TaxClassService) {}

  @Post()
  create(@Body() dto: CreateTaxClassDto, @CurrentUser() user: RequestUser) {
    return this.taxClassService.create(dto, user.tenantId);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.taxClassService.findAll(user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaxClassDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.taxClassService.update(id, dto, user.tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.taxClassService.remove(id, user.tenantId);
  }
}
