// @ts-ignore
import seedrandom from 'seedrandom';
import _ from 'lodash';
import {ModernArtState, ModernArtEvent, AuctionStatus} from './types';

/**
 * A helper function that contains meat of reducer code.
 *
 * Returns undefined for invalid events
 */
export const modernArtReducerHelper = (
  state: ModernArtState,
  event: ModernArtEvent
): ModernArtState | undefined => {
  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
  if (event.type === 'start_game') {
    return {
      ...state,
      started: true,
      users: _.mapValues(state.users, (user) => ({
        ...user,
        money: 100,
      })),
      rounds: {
        '0': {
          auctions: [],
          users: _.mapValues(state.users, (user) => ({
            id: user.id,
            acquiredArt: [],
          })),
        },
      },
    };
  }
  if (event.type === 'submit_bid') {
    if (!state.currentAuction) return;
    if (event.params.bidAmount > (state.currentAuction.highestBid ?? 0)) {
      return {
        ...state,
        currentAuction: {
          ...state.currentAuction,
          highestBidder: event.params.userId,
          highestBid: event.params.bidAmount,
        },
      };
    }
  }
  if (event.type === 'finish_auction') {
    if (!state.currentAuction) return undefined;
    // give winner the painting, store in new rounds field
    const auctioneer = state.currentAuction.auctioneer;
    // todo: handle when there is no winner (aka nobody wants to bid)
    const winner = state.currentAuction.highestBidder;
    if (!auctioneer || !winner) return undefined;
    const payment = state.currentAuction.highestBid || state.currentAuction.fixedPrice || -1;
    const closedAuction = {
      ...state.currentAuction,
      status: AuctionStatus.CLOSED,
      winner,
      payment,
    };

    return {
      ...state,
      users: {
        ...state.users,
        [winner]: {
          ...state.users[winner],
          money: state.users[winner].money - payment,
        },
        [auctioneer]: {
          ...state.users[auctioneer],
          money: state.users[auctioneer].money - payment,
        },
      },
      rounds: {
        ...state.rounds,
        [state.roundIndex]: {
          auctions: [...(state.rounds[state.roundIndex]?.auctions ?? []), closedAuction],
          users: {
            ...state.rounds[state.roundIndex]?.users,
            [winner]: [
              ...(state.rounds[state.roundIndex]?.users[winner]?.acquiredArt ?? []),
              closedAuction.painting,
            ],
          },
        },
      },
      currentAuction: closedAuction,
    };
  }
  if (event.type === 'update_name') {
    return {
      ...state,
      users: {
        ...state.users,
        [event.params.id]: {
          // @ts-ignore
          cards: [],
          ...state.users[event.params.id],
          name: event.params.name,
          icon: event.params.icon,
          id: event.params.id,
        },
      },
    };
  }

  if (event.type === 'step') {
    // do the next automated step depending on the game state
    if (!state.roundStarted) {
      const prng = seedrandom(event.params.seed ?? 1);
      const CARDS_TO_DEAL: Record<string, number[] | undefined> = {
        // TODO
        1: [10, 10, 10],
        2: [10, 10, 10],
        3: [10, 10, 10],
        4: [10, 5, 3],
      };
      const cardsToDeal = CARDS_TO_DEAL[`${_.size(state.users)}`]?.[state.roundIndex] ?? 0;
      const auctionTypes = ['hidden', 'open'];

      const colors = ['red', 'blue', 'yellow', 'green', 'purple'];
      const ALL_CARDS = _.flatMap(colors, (color) =>
        auctionTypes.map((auctionType) => ({
          color,
          auctionType,
        }))
      );
      let deck = [...ALL_CARDS, ...ALL_CARDS, ...ALL_CARDS, ...ALL_CARDS];
      for (let i = 0; i < deck.length; i += 1) {
        const j = Math.floor(prng() * (i + 1));
        const tmp = deck[j];
        deck[j] = deck[i];
        deck[i] = tmp;
      }
      const deal = () => {
        const res = deck[0];
        deck = deck.slice(1);
        return res;
      };

      return {
        ...state,
        deck,
        users: _.mapValues(state.users, (user) => ({
          ...user,
          cards: [...user.cards, ..._.times(cardsToDeal, deal)],
        })),
        roundStarted: true,
      };
    }
  }

  if (event.type === 'start_auction') {
    const userId = event.params.userId;
    const idx = event.params.idx;
    const card = state.users[userId].cards[idx];
    console.log('start auction', card);
    const color = state.users[userId].cards[idx].color;

    // If fifth painting of this color, do not auction and end round
    const count = _.filter(state.rounds[state.roundIndex].auctions, (x) => x.painting.color === color).length;
    const user = state.users[userId];
    const nUsers = {
      ...state.users,
      [userId]: {
        ...user,
        // remove card
        cards: [...user.cards.slice(0, idx), ...user.cards.slice(idx + 1)],
      },
    };

    if (count === 5) {
      // todo: give priority to lowest color
      const auctions = state.rounds[state.roundIndex].auctions; // color: [painting]
      const colorFreq = _.groupBy(auctions, (x) => x.painting.color);
      const sortedColorFreq = _.sortBy(_.keys(colorFreq), (x) => -colorFreq[x].length);
      return {
        ...state,
        users: nUsers,
        roundIndex: state.roundIndex + 1,
        // new round
        rounds: {
          ...state.rounds,
          [state.roundIndex + 1]: {
            auctions: [],
            users: _.map(state.users, (user) => ({
              [user.id]: [],
            })),
          },
        },
      };
    }

    // round did not end
    const auction = {
      status: AuctionStatus.PENDING,
      auctioneer: userId,
      painting: card,
      highestBid: 0,
    };
    return {
      ...state,
      currentAuction: auction,
      users: nUsers,
      rounds: {
        ...state.rounds,
        [state.roundIndex]: {
          ...state.rounds[state.roundIndex],
          auctions: state.rounds[state.roundIndex].auctions.concat(auction),
        },
      },
      log: [
        ...state.log,
        {
          timestamp,
          text: ``,
        },
      ],
    };
    // pass
  }
  return state;
};

/**
 * A helper function that contains meat of reducer code.
 *
 * Returns undefined for invalid events
 */
export const modernArtValidatorHelper = (state: ModernArtState, event: ModernArtEvent): boolean => {
  if (event.type === 'start_game') {
    return !state.started;
  }
  if (event.type === 'submit_bid') {
    if (!state.currentAuction) return false;
    if (state.currentAuction.status === AuctionStatus.CLOSED) {
      console.log('cannot submit_bid because auction is closed');
      return false;
    }
    return true;
  }
  if (event.type === 'finish_auction') {
    if (!state.currentAuction) return false;
    if (state.currentAuction.status === AuctionStatus.CLOSED) {
      console.log('cannot finish_auction because auction is closed');
      return false;
    }
    return true;
  }
  if (event.type === 'update_name') {
    return true;
  }
  if (event.type === 'start_auction') {
    if (!state.currentAuction) return false;
    if (state.currentAuction.status === AuctionStatus.PENDING) {
      console.log('cannot finish_auction because auction is closed');
      return false;
    }
    return true;
  }
  return true;
};

export const modernArtReducer = (state: ModernArtState, event: ModernArtEvent): ModernArtState => {
  try {
    if (!modernArtValidatorHelper(state, event)) {
      console.warn('skipping failed validation event', state, event);
      return state;
    }
    const result = modernArtReducerHelper(state, event);
    if (!result) {
      console.warn('skipping invalid event', state, event);
      return state;
    }
    return result;
  } catch (e) {
    console.warn('failed to reduce', state, event);
    console.error(e);
    return state;
  }
};
