import { Customer } from '../entities/customer.entity';

export abstract class ICustomerRepository {
  abstract findById(id: string): Promise<Customer | null>;
  abstract findBySiren(siren: string): Promise<Customer | null>;
  abstract findActive(): Promise<Customer[]>;
  abstract findChurnRisk(scoreThreshold: number): Promise<Customer[]>;
  abstract save(customer: Customer): Promise<Customer>;
  abstract update(customer: Customer): Promise<Customer>;
}
