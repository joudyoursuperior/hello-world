import { IsNotEmpty, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsNotEmpty()
  token!: string;

  @IsNotEmpty()
  fullName!: string;

  @MinLength(8)
  password!: string;
}
