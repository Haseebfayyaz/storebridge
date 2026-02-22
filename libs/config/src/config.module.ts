import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';

@Module({})
export class AppConfigModule {
  static forApp(appEnvPath: string): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: [appEnvPath, '.env'],
          load: [configuration],
          expandVariables: true,
        }),
      ],
      exports: [ConfigModule],
    };
  }
}
