const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');
const cors = require('cors');

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/blockchainVoting', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// Blockchain Implementation
class Block {
    constructor(index, timestamp, data, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        return CryptoJS.SHA256(
            this.index +
            this.timestamp +
            JSON.stringify(this.data) +
            this.previousHash
        ).toString();
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
    }

    createGenesisBlock() {
        return new Block(0, new Date().toISOString(), "Genesis Block", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(newBlock) {
        newBlock.previousHash = this.getLatestBlock().hash;
        newBlock.hash = newBlock.calculateHash();
        this.chain.push(newBlock);
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.hash !== currentBlock.calculateHash()) {
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
        }
        return true;
    }
}

// Initialize Blockchain
const votingBlockchain = new Blockchain();

// Mongoose Schema and Model
const voterSchema = new mongoose.Schema({
    voterId: { type: String, required: true, unique: true },
    candidate: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    blockchainHash: { type: String, required: true },
});
const Voter = mongoose.model('Voter', voterSchema);

// Function to Save Votes to MongoDB
async function saveVoteToMongoDB(block) {
    try {
        const { voterId, candidate } = block.data;
        const newVote = new Voter({
            voterId,
            candidate,
            timestamp: block.timestamp,
            blockchainHash: block.hash,
        });

        await newVote.save();
        console.log('Vote successfully saved to MongoDB.');
    } catch (error) {
        console.error('Error saving vote to MongoDB:', error.message);
    }
}

// API Endpoints
// Fetch Blockchain Data
app.get('/blockchain', (req, res) => {
    res.json(votingBlockchain);
});

// Cast a Vote
app.post('/vote', async (req, res) => {
    const { voterId, candidate } = req.body;

    // Check if voter already voted
    const existingVoter = await Voter.findOne({ voterId });
    if (existingVoter) {
        return res.status(400).json({ message: 'You have already voted!' });
    }

    // Create a new block
    const newBlock = new Block(
        votingBlockchain.chain.length,
        new Date().toISOString(),
        { voterId, candidate }
    );

    // Add block to blockchain
    votingBlockchain.addBlock(newBlock);

    // Save to MongoDB
    await saveVoteToMongoDB(newBlock);

    res.json({ message: `Vote cast successfully for ${candidate}!` });
});

// List All Voters
app.get('/voters', async (req, res) => {
    const voters = await Voter.find();
    res.json(voters);
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// Fetch Votes Count
app.get('/results', async (req, res) => {
    try {
        // Aggregate votes by candidate
        const voteCounts = await Voter.aggregate([
            { $group: { _id: "$candidate", count: { $sum: 1 } } }
        ]);

        res.json(voteCounts);
    } catch (error) {
        console.error('Error fetching vote counts:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});