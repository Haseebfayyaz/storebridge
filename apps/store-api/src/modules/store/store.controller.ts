import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppRole } from 'models';
import { JwtAuthGuard, Roles, RolesGuard } from 'auth';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreService } from './store.service';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    tenantId: string | null;
  };
}

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @Roles(AppRole.ADMIN, AppRole.STORE)
  create(@Body() dto: CreateStoreDto) {
    return this.storeService.create(dto);
  }

  @Get()
  // @Roles(AppRole.ADMIN, AppRole.STORE, AppRole.USER)
  findAll(@Req() req: RequestWithUser) {
    return this.storeService.findAll(req.user.tenantId);
  }

  @Get(':id')
  @Roles(AppRole.ADMIN, AppRole.STORE, AppRole.USER)
  findOne(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.STORE)
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.storeService.update(id, dto);
  }

  @Delete(':id')
  @Roles(AppRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.storeService.remove(id);
  }
}
