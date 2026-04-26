import { Test } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  let controller: InventoryController;
  let inventoryService: {
    listInventoryForBuyers: jest.Mock;
    getInventoryDetail: jest.Mock;
    getSimilarItemsByCategory: jest.Mock;
  };

  beforeEach(async () => {
    inventoryService = {
      listInventoryForBuyers: jest.fn(),
      getInventoryDetail: jest.fn(),
      getSimilarItemsByCategory: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: inventoryService,
        },
      ],
    }).compile();

    controller = moduleRef.get(InventoryController);
  });

  it('delegates buyer listing to the service', () => {
    const query = {
      limit: 10,
      sortBy: 'date' as const,
      sortOrder: 'desc' as const,
    };

    controller.list(query);

    expect(inventoryService.listInventoryForBuyers).toHaveBeenCalledWith(query);
  });

  it('delegates detail lookup to the service', () => {
    controller.detail('inv-1');

    expect(inventoryService.getInventoryDetail).toHaveBeenCalledWith('inv-1');
  });

  it('delegates similar item lookup to the service', () => {
    controller.similar('inv-1');

    expect(inventoryService.getSimilarItemsByCategory).toHaveBeenCalledWith('inv-1');
  });
});
