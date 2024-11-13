import { z } from "zod";
import { BrianTool } from "./tool.js";
import { BrianSDK } from "@brian-ai/sdk";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
} from "viem";
import { getChain } from "@/utils";

const borrowToolSchema = z.object({
  token: z.string(),
  chain: z.string(),
  amount: z.string(),
});

export const createBorrowTool = (brianSDK: BrianSDK, account: Account) => {
  return new BrianTool({
    name: "borrow",
    description:
      "borrows the amount of token from aave on the given chain. you must've deposited before to execute this action.",
    schema: borrowToolSchema,
    brianSDK,
    account,
    func: async ({ token, amount, chain }) => {
      const prompt = `Borrow ${amount} ${token} on ${chain}`;

      const brianTx = await brianSDK.transact({
        prompt,
        address: account.address,
      });

      if (brianTx.length === 0) {
        return "Whoops, could not perform the borrow, an error occurred while calling the Brian APIs.";
      }

      const [tx] = brianTx;
      const { data } = tx;

      let lastTxLink = "";

      if (data.steps && data.steps.length > 0) {
        const chainId = data.fromChainId;
        const network = getChain(chainId!);

        const walletClient = createWalletClient({
          account,
          chain: network,
          transport: http(),
        });
        const publicClient = createPublicClient({
          chain: network,
          transport: http(),
        });

        for (const step of data.steps) {
          if (step.chainId !== walletClient.chain.id) {
            // change chain
            await walletClient.switchChain({ id: step.chainId });
          }

          const txHash = await walletClient.sendTransaction({
            from: step.from,
            to: step.to,
            value: BigInt(step.value),
            data: step.data,
            chainId: step.chainId,
          });

          console.log(
            `Transaction executed, tx hash: ${txHash} -- waiting for confirmation.`
          );

          const { transactionHash } =
            await publicClient.waitForTransactionReceipt({
              hash: txHash,
            });

          console.log(
            `Transaction executed successfully, this is the transaction link: ${network.blockExplorers?.default.url}/tx/${transactionHash}`
          );

          lastTxLink = `${network.blockExplorers?.default.url}/tx/${transactionHash}`;
        }

        return `Borrow executed successfully! I've borrowed ${amount} of ${token} on ${chain}. You can check the transaction here: ${lastTxLink}`;
      }

      return "No transaction to be executed from this prompt. Maybe you should try with another one?";
    },
  });
};