import { useState, Fragment, Dispatch } from 'react';
import { useWeb3React } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import { Listbox } from '@headlessui/react';
import { TokenInfo } from 'types';
import { Contract } from '@ethersproject/contracts';
import { MaxUint256 } from '@ethersproject/constants';
import { parseUnits } from '@ethersproject/units';
import { hexlify } from '@ethersproject/bytes';
import { CheckIcon } from '@heroicons/react/solid';
import { ZenethRelayer } from '@scopelift/zeneth-js';
import SwapBriber from '@scopelift/zeneth-contracts/artifacts/contracts/SwapBriber.sol/SwapBriber.json';
import { config } from 'config';
const zkSyncAddress = '0xaBEA9132b05A70803a4E85094fD0e1800777fBEF';

const erc20abi = [
  // Read-Only Functions
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',

  // Authenticated Functions
  'function transfer(address to, uint amount) returns (boolean)',
  'function approve(address spender, uint256 value) returns (boolean)',
];

const zkSyncAbi = [
  // Read-Only Functions
  'function depositERC20(address _token, uint104 _amount, address _franklinAddr)',
];

const supportedTokens: TokenInfo[] = [
  {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    name: 'Dai',
    symbol: 'DAI',
    chainId: 1,
    decimals: 18,
  },
];

type l2Info = {
  name: string;
  address: string;
  abi: string[];
  encodeDeposit: (amount: string, tokenAddress: string, recipient: string) => string;
};

const supportedL2s: l2Info[] = [
  {
    name: 'zkSync',
    address: zkSyncAddress,
    abi: zkSyncAbi,
    encodeDeposit: (amount: string, tokenAddress: string, recipient: string) =>
      new Contract(zkSyncAddress, zkSyncAbi).interface.encodeFunctionData('depositERC20', [
        tokenAddress,
        amount,
        recipient,
      ]),
  },
];

const inputStyle = 'bg-gray-200 rounded p-3 w-full block';

const L2Form = () => {
  const { account, library } = useWeb3React<Web3Provider>();
  const [formState, setFormState] = useState<{
    token: TokenInfo | undefined;
    l2: l2Info | undefined;
    amount: string;
    minerFee: string;
  }>({
    token: supportedTokens[0],
    l2: supportedL2s[0],
    amount: parseUnits('1000', 18).toString(),
    minerFee: parseUnits('100', 18).toString(),
  });
  if (!library) return null;
  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    setFormState({
      ...formState,
      [e.target.name]: value,
    });
  };
  const doSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.l2) throw new Error('token not set');
    const erc20 = new Contract(formState.token.address, erc20abi);
    const l2 = new Contract(formState.l2.address, formState.l2.abi);
    const zenethRelayer = await ZenethRelayer.create(library, process.env.AUTH_SIGNING_KEY as string);
    const { swapBriber } = config.networks[5];
    const swapBriberContract = new Contract(swapBriber, SwapBriber.abi);
    const bribeAmount = parseUnits('.01', 18);
    const fragments = [
      {
        data: formState.l2.encodeDeposit(formState.amount, erc20.address, account as string),
        gasLimit: hexlify(300000),
        to: l2.address,
        value: '0x0',
      },
      {
        data: erc20.interface.encodeFunctionData('approve', [swapBriber, MaxUint256.toString()]),
        gasLimit: hexlify(100000),
        to: erc20.address,
        value: '0x0',
      },
      {
        data: swapBriberContract.interface.encodeFunctionData('swapAndBribe', [
          erc20.address, // token to swap
          formState.minerFee, // fee in tokens
          bribeAmount.toString(), // bribe amount in ETH. less than or equal to DAI from above
          '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // uniswap router address (goerli)
          [erc20.address, '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'], // path of swap // TODO: put in config!! varies per network!! mainnet: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
          '2000000000', // really big deadline
        ]),
        gasLimit: hexlify(250000),
        to: swapBriber,
        value: '0x0',
      },
    ];
    console.log(fragments);
    const signatures = await zenethRelayer.signBundle(account as string, fragments, library);
    console.log(signatures);
    const bundlePromises = await zenethRelayer.sendBundle(signatures, 10);
    console.log(bundlePromises);
    // const responses =
  };

  const formGroup = 'my-2 flex flex-row';
  const label = 'w-28 block self-center';
  return (
    <div className="border-green-500 border-solid border-2 drop-shadow-sm p-3">
      <form className="flex flex-col">
        <div className={formGroup}>
          <label className={label}>Token</label>
          <TokenListbox
            selectedToken={formState.token}
            supportedTokens={supportedTokens}
            setToken={(token) => setFormState({ ...formState, token })}
          />
        </div>
        <div className={formGroup}>
          <label className={label}>L2</label>
          <L2Listbox
            selectedL2={formState.l2}
            supportedL2s={supportedL2s}
            setL2={(l2) => setFormState({ ...formState, l2 })}
          />
        </div>
        <div className={formGroup}>
          <label className={label}>Amount</label>
          <input name="amount" value={formState.amount} className={inputStyle} onChange={handleChange} />
        </div>
        <div className={formGroup}>
          <label className={label}>Fee</label>
          <input name="minerFee" value={formState.minerFee} className={inputStyle} onChange={handleChange} />
        </div>
        <button className="p-3 bg-gradient-to-r from-green-200 to-purple-200 rounded" onClick={doSubmit}>
          Submit
        </button>
      </form>
    </div>
  );
};

const TokenListbox = ({
  supportedTokens,
  selectedToken,
  setToken,
}: {
  supportedTokens: TokenInfo[];
  selectedToken: TokenInfo | undefined;
  setToken: Dispatch<TokenInfo>;
}) => {
  return (
    <Listbox value={selectedToken} onChange={setToken}>
      <Listbox.Button className={inputStyle}>
        {selectedToken ? `${selectedToken.symbol as string} (${selectedToken.address as string})` : 'Select Token'}
      </Listbox.Button>
      <Listbox.Options>
        {supportedTokens.map((token) => (
          <Listbox.Option key={token.address} value={token} as={Fragment}>
            {({ active, selected }) => (
              <li className={`${active ? 'bg-blue-500 text-white' : 'bg-white text-black'}`}>
                {selected && <CheckIcon className="h-5 w-5 text-blue-500" />}
                {token.symbol}
              </li>
            )}
          </Listbox.Option>
        ))}
      </Listbox.Options>
    </Listbox>
  );
};

const L2Listbox = ({
  supportedL2s,
  selectedL2,
  setL2,
}: {
  supportedL2s: TokenInfo[];
  selectedL2: TokenInfo | undefined;
  setL2: Dispatch<TokenInfo>;
}) => {
  return (
    <Listbox value={selectedL2} onChange={setL2}>
      <Listbox.Button className={inputStyle}>
        {selectedL2 ? `${selectedL2.name as string} (${selectedL2.address as string})` : 'Select Token'}
      </Listbox.Button>
      <Listbox.Options>
        {supportedL2s.map((l2) => (
          <Listbox.Option key={l2.address} value={l2} as={Fragment}>
            {({ active, selected }) => (
              <li className={`${active ? 'bg-blue-500 text-white' : 'bg-white text-black'}`}>
                {selected && <CheckIcon className="h-5 w-5 text-blue-500" />}
                {l2.name}
              </li>
            )}
          </Listbox.Option>
        ))}
      </Listbox.Options>
    </Listbox>
  );
};

export default L2Form;
