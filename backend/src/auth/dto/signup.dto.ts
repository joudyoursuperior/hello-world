import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class SignupDto {
  @IsNotEmpty()
  clinicName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsNotEmpty()
  ownerName!: string;

  @MinLength(8)
  password!: string;
}
