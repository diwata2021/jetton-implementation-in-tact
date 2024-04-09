import { Address, beginCell, contractAddress, toNano, TonClient4, internal, fromNano, WalletContractV4 } from "@ton/ton";
import { deploy } from "./utils/deploy";
import { printAddress, printDeploy, printHeader, printSeparator } from "./utils/print";
import { buildOnchainMetadata } from "./utils/jetton-helpers";
import { mnemonicToPrivateKey } from "ton-crypto";
import * as dotenv from "dotenv";
dotenv.config();
// ========================================
import { SampleJetton, storeTokenTransfer } from "./output/SampleJetton_SampleJetton";
// ========================================

let NewOnwer_Address = Address.parse("UQABdDBcEXsOQ903TiJzoQllT5kLMvAal22Wbrm5R7_ItgLn"); // 🔴 Owner should usually be the deploying wallet's address.

(async () => {
    const client4 = new TonClient4({
        //create client for testnet sandboxv4 API - alternative endpoint
        endpoint: "https://sandbox-v4.tonhubapi.com",
    });

    let mnemonics = (process.env.mnemonics || "").toString(); // 🔴 Change to your own, by creating .env file!
    let reciverMnemonics = (process.env.mnemonics_receiver || "").toString();
    let keyPair = await mnemonicToPrivateKey(mnemonics.split(" "));
    let reciverKeyPair = await mnemonicToPrivateKey(reciverMnemonics.split(" "));
    let secretKey = reciverKeyPair.secretKey;
    let workchain = 0;
    let wallet = WalletContractV4.create({
        workchain,
        publicKey: keyPair.publicKey,
    });
    let recieverWallet = WalletContractV4.create({
        workchain,
        publicKey: reciverKeyPair.publicKey,
    });

    let wallet_contract = client4.open(wallet);
    let reciver_wallet_contract = client4.open(recieverWallet);
    const jettonParams = {
        name: "DiwataTokenV1",
        description: "This is description of Test Jetton Token in Tact-lang contain fee",
        symbol: "DT-V1",
        image: "https://avatars.githubusercontent.com/u/104382459?s=200&v=4",
    };

    // Create content Cell
    let content = buildOnchainMetadata(jettonParams);
    let max_supply = toNano(123456766689011); // 🔴 Set the specific total supply in nano

    // Compute init data for deployment
    // NOTICE: the parameters inside the init functions were the input for the contract address
    // which means any changes will change the smart contract address as well.
    let init = await SampleJetton.init(wallet_contract.address, content, max_supply);
    let jetton_masterWallet = contractAddress(workchain, init);
    let contract_dataFormat = SampleJetton.fromAddress(jetton_masterWallet);
    let contract = client4.open(contract_dataFormat);
    let jetton_wallet = await contract.getGetWalletAddress(reciver_wallet_contract.address);
    console.log("✨ " + reciver_wallet_contract.address + "'s JettonWallet ==> ");
    // ✨Pack the forward message into a cell
    const test_message_left = beginCell()
        .storeBit(0) // 🔴  whether you want to store the forward payload in the same cell or not. 0 means no, 1 means yes.
        .storeUint(0, 32)
        .storeBuffer(Buffer.from("Hello, GM -- Left.", "utf-8"))
        .endCell();

    // const test_message_right = beginCell()
    //     .storeBit(1) // 🔴 whether you want to store the forward payload in the same cell or not. 0 means no, 1 means yes.
    //     .storeRef(beginCell().storeUint(0, 32).storeBuffer(Buffer.from("Hello, GM. -- Right", "utf-8")).endCell())
    //     .endCell();

    // ========================================
    let forward_string_test = beginCell().storeBit(1).storeUint(0, 32).storeStringTail("EEEEEE").endCell();
    let packed = beginCell()
        .store(
            storeTokenTransfer({
                $$type: "TokenTransfer",
                query_id: 0n,
                amount: toNano(100),
                sender:NewOnwer_Address,
                response_destination: reciver_wallet_contract.address, 
                custom_payload: forward_string_test,
                forward_ton_amount: toNano("0.0001"),
                forward_payload: test_message_left,
            })
        )
        .endCell();

    let deployAmount = toNano("0.3");
    let seqno: number = await reciver_wallet_contract.getSeqno();
    let balance: bigint = await reciver_wallet_contract.getBalance();
    // ========================================
    printSeparator();
    console.log("Current deployment wallet balance: ", fromNano(balance).toString(), "💎TON");
    console.log("\n🛠️ Calling To JettonWallet:\n" + jetton_wallet + "\n");
    await reciver_wallet_contract.sendTransfer({
        seqno,
        secretKey,
        messages: [
            internal({
                to: jetton_wallet,
                value: deployAmount,
                init: {
                    code: init.code,
                    data: init.data,
                },
                bounce: true,
                body: packed,
            }),
        ],
    });
})();
