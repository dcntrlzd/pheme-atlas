/* eslint-disable class-methods-use-this */
import { IStorage } from '@pheme-kit/core';
import { v4 as uuid } from 'uuid';

export default class TestStorage implements IStorage {
  public storage: { [address: string]: any } = {};

  public publicUrlFor = (address: string) => `https://GATEWAY_URL/${address}`;

  public readData = (address: string) => {
    const url = new URL(address);
    return Promise.resolve(this.storage[url.host]);
  };

  public writeData = (data: Buffer) => {
    const address = uuid();
    this.storage[address] = data;
    return Promise.resolve(`test://${address}`);
  };

  public readObject = async (address: string): Promise<any> => {
    return this.deserialize(await this.readData(address));
  };

  public writeObject = (object: any): Promise<string> => {
    return this.writeData(Buffer.from(this.serialize(object)));
  };

  public serialize(input: any) {
    return JSON.stringify(input);
  }

  public deserialize(input: string) {
    return JSON.parse(input);
  }

  public addressForEstimation = () => 'TEST_ADDRESS_FOR_ESTIMATION';
}
