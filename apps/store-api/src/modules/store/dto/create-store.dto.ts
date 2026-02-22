import { IsString, Length } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(1, 191)
  ownerId!: string;
}
