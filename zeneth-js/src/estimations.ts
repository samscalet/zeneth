import { getGasPrice, getTokenPriceInUsd } from './helpers';
import { ethAddress } from './constants';
import { BigNumberish, BigNumber } from '@ethersproject/bignumber';
import { formatEther, parseUnits } from '@ethersproject/units';

/**
 * @notice Estimates the fee (in base token units) for a bundle
 * @param obj
 * @param obj.tokenAddress Token in which fee will be expressed as units of
 * @param obj.transferUpperBound Given upper bound gas fee (in wei) for transfer
 * @param obj.approveUpperBound Given upper bound gas fee (in wei) for approve
 * @param obj.swapUpperBound Given upper bound gas fee (in wei) for swap
 * @param obj.flashbotsAdjustment Multiplier for flashbots bribing miner, e.g. 1.05 to add 5%
 * @returns Estimated fee for miner in token base units
 */
export const estimateTransferFee = async ({
  tokenAddress,
  tokenDecimals,
  transferUpperBound,
  approveUpperBound,
  swapUpperBound,
  flashbotsAdjustment,
}: {
  tokenAddress: string;
  tokenDecimals: number;
  transferUpperBound: BigNumberish;
  approveUpperBound: BigNumberish;
  swapUpperBound: BigNumberish;
  flashbotsAdjustment: number;
}): Promise<BigNumber> => {
  const [gasPriceInWei, tokenPrice, ethPrice] = await Promise.all([
    getGasPrice(),
    getTokenPriceInUsd(tokenAddress),
    getTokenPriceInUsd(ethAddress),
  ]);

  const bundleGasUsed = BigNumber.from(transferUpperBound).add(approveUpperBound).add(swapUpperBound); // total gas needed
  const bundlePriceInWei = bundleGasUsed.mul(gasPriceInWei); // total gas price in wei
  const scaledBundlePriceInWei = bundlePriceInWei.mul(BigNumber.from(flashbotsAdjustment * 1000)).div(1000); // total gas, scaled up
  const bundlePriceInEth = +formatEther(scaledBundlePriceInWei); // total gas, denominated in ETH
  const bundlePriceInUsd = bundlePriceInEth * ethPrice; // total gas, denominated in dollars
  const tokensNeededForBribe = parseUnits(String(bundlePriceInUsd / tokenPrice), tokenDecimals); // total gas, demoninated in token
  return tokensNeededForBribe;
};
