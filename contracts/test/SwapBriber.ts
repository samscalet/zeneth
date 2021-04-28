import hre, { ethers } from 'hardhat';
const { isAddress, parseUnits } = ethers.utils;
import { Artifact } from 'hardhat/types';

//import { SwapBriber, TestToken, MockWeth, IUniswapV2Factory, IUniswapV2Router02 } from '../typechain';
import { SwapBriber, TestToken, MockWeth } from '../typechain';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { parseEther } from '@ethersproject/units';
import { Contract } from "@ethersproject/contracts";


const { deployContract } = hre.waffle;

// Import Uniswap contract artifacts from their package
const UniswapV2FactoryArtifact = require('@uniswap/v2-core/build/UniswapV2Factory.json');
// const UniswapV2PairArtifact = require('@uniswap/v2-core/build/UniswapV2Pair.json');
const UniswapV2Router02Artifact = require('@uniswap/v2-periphery/build/UniswapV2Router02.json');

const farFuture = '2000000000'; // Unix timestamp well into the future

describe('SwapBriber', () => {
  let admin: SignerWithAddress;
  let sender: SignerWithAddress;
  let lp: SignerWithAddress;
  let token: TestToken;
  let briber: SwapBriber;
  let weth: MockWeth;
  // let uniswapFactory: IUniswapV2Factory;
  // let uniswapRouter: IUniswapV2Router02;
  let uniswapFactory: Contract;
  let uniswapRouter: Contract;

  // The liquidity to be provided to the token/ETH pool
  const lpTokens = parseUnits('2500', 18);
  const lpETH = parseEther('5000');
  const bribeTokens = parseUnits('0.5', 18);

  // Token price denominated in ETH based on pool ratio
  const tokenPrice = lpETH.div(lpTokens);

  // The bribe ETH is the is the amount of ETH the user can buy with their tokens,
  // allowing for up to 5% slippage
  const bribeEth = tokenPrice.mul(bribeTokens).div(100).mul(95);

  before(async () => {
    [admin, sender, lp] = await hre.ethers.getSigners();
  });

  it('should deploy', async () => {
    const swapBriberArtifact: Artifact = await hre.artifacts.readArtifact('SwapBriber');
    briber = (await deployContract(admin, swapBriberArtifact, [])) as SwapBriber;
    expect(isAddress(briber.address), 'Failed to deploy SwapBriber').to.be.true;

    const testTokenArtifact: Artifact = await hre.artifacts.readArtifact('TestToken');
    token = (await deployContract(admin, testTokenArtifact, ['Test Token', 'TT'])) as TestToken;
    expect(isAddress(token.address), 'Failed to deploy TestToken').to.be.true;

    const mockWethArtifact: Artifact = await hre.artifacts.readArtifact('MockWETH');
    weth = (await deployContract(admin, mockWethArtifact, [])) as MockWeth;
    expect(isAddress(weth.address), 'Failed to deploy MockWETH').to.be.true;

    uniswapFactory = (await deployContract(admin, UniswapV2FactoryArtifact, [admin.address]));
    expect(isAddress(uniswapFactory.address), 'Failed to deploy Uniswap Factory').to.be.true;

    uniswapRouter = (await deployContract(admin, UniswapV2Router02Artifact, [
      uniswapFactory.address,
      weth.address,
    ]));
    expect(isAddress(uniswapRouter.address), 'Failed to deploy Uniswap Router').to.be.true;
  });

  it('should mint tokens', async () => {
    await token.mint(lp.address, lpTokens);
    const lpBalance = await token.balanceOf(lp.address);
    expect(lpBalance.eq(lpTokens), 'Failed to mint LP tokens').to.be.true;

    await token.mint(sender.address, bribeTokens);
    const senderBalance = await token.balanceOf(sender.address);
    expect(senderBalance.eq(bribeTokens), 'Failed to mint tokens').to.be.true;
  });

  it('should add liquidity', async () => {
    await token.connect(lp).approve(uniswapRouter.address, lpTokens);

    await uniswapRouter
      .connect(lp)
      .addLiquidityETH(token.address, lpTokens, lpTokens, lpETH, lp.address, farFuture, { value: lpETH });
  });

  it('should do a swap bribe', async () => {
    await token.connect(sender).approve(briber.address, bribeTokens);

    await briber
      .connect(sender)
      .swapAndBribe(
        token.address,
        bribeTokens,
        bribeEth,
        uniswapRouter.address,
        [token.address, weth.address],
        farFuture,
      );

    const briberBalance = await token.balanceOf(briber.address);
    expect(briberBalance.eq(0), 'Failed to trade tokens').to.be.true;
  });
});