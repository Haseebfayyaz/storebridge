import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { InventoryLog } from '../inventory/interfaces/inventory-log.interface';

@Injectable()
export class ElasticsearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client | null = null;
  private readonly defaultInventoryIndexName: string;
  private readonly node: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.node = this.configService.get<string>('ELASTICSEARCH_NODE');
    this.defaultInventoryIndexName =
      this.configService.get<string>('ELASTICSEARCH_INDEX') ?? 'inventory_logs';
  }

  async onModuleInit(): Promise<void> {
    if (!this.node) {
      this.logger.warn('ELASTICSEARCH_NODE is not configured. Logging is disabled.');
      return;
    }

    try {
      this.client = new Client({
        node: this.node,
        ...(this.configService.get<string>('ELASTICSEARCH_USERNAME')
          ? {
              auth: {
                username: this.configService.getOrThrow<string>(
                  'ELASTICSEARCH_USERNAME',
                ),
                password: this.configService.getOrThrow<string>(
                  'ELASTICSEARCH_PASSWORD',
                ),
              },
            }
          : {}),
      });

      await this.ensureInventoryLogIndex(this.defaultInventoryIndexName);
    } catch (error) {
      this.logger.error('Failed to initialize Elasticsearch client', error);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.close();
  }

  async indexDocument<T extends object>(
    index: string,
    document: T,
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.index({
        index,
        document,
      });
    } catch (error) {
      this.logger.error(`Failed to index document into index="${index}"`, error);
    }
  }

  async logInventoryChange(payload: InventoryLog): Promise<void> {
    await this.indexDocument(this.defaultInventoryIndexName, payload);
  }

  private async ensureInventoryLogIndex(indexName: string): Promise<void> {
    if (!this.client) {
      return;
    }

    const exists = await this.client.indices.exists({ index: indexName });
    if (exists) {
      return;
    }

    await this.client.indices.create({
      index: indexName,
      mappings: {
        properties: {
          inventoryId: { type: 'keyword' },
          tenantId: { type: 'keyword' },
          storeId: { type: 'keyword' },
          productId: { type: 'keyword' },
          variantId: { type: 'keyword' },
          action: { type: 'keyword' },
          previousStock: { type: 'integer' },
          newStock: { type: 'integer' },
          changedBy: { type: 'keyword' },
          timestamp: { type: 'date' },
        },
      },
      settings: {
        number_of_shards: 3,
        number_of_replicas: 1,
      },
    });
  }
}
