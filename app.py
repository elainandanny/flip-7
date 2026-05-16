import streamlit as st
from collections import Counter

st.set_page_config(
    page_title="Flip 7 Advisor",
    page_icon="🃏",
    layout="centered"
)

NUMBER_COUNTS = {
    0: 1,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    11: 11,
    12: 12,
}

SPECIAL_COUNTS = {
    "+2": 1,
    "+4": 1,
    "+6": 1,
    "+8": 1,
    "+10": 1,
    "x2": 1,
    "Second Chance": 3,
    "Freeze": 3,
    "Flip Three": 3,
}

ALL_CARDS = [str(n) for n in range(13)] + list(SPECIAL_COUNTS.keys())


def build_deck():
    deck = Counter()

    for card, count in NUMBER_COUNTS.items():
        deck[str(card)] = count

    for card, count in SPECIAL_COUNTS.items():
        deck[card] = count

    return deck


def score_hand(cards):
    numbers = []
    modifiers = []

    for card in cards:
        if card.isdigit():
            numbers.append(int(card))
        elif card in ["+2", "+4", "+6", "+8", "+10", "x2"]:
            modifiers.append(card)

    total = sum(numbers)
    multiplier = 1
    bonus = 0

    for modifier in modifiers:
        if modifier == "x2":
            multiplier *= 2
        elif modifier.startswith("+"):
            bonus += int(modifier[1:])

    score = total * multiplier + bonus

    if len(set(numbers)) >= 7:
        score += 15

    return score


def evaluate(my_cards, visible_cards, has_second_chance, risk_mode):
    deck = build_deck()

    for card in my_cards + visible_cards:
        deck[card] -= 1

    if has_second_chance:
        deck["Second Chance"] -= 1

    deck = +deck
    total_cards = sum(deck.values())

    if total_cards == 0:
        return {
            "recommendation": "STAY",
            "current_score": score_hand(my_cards),
            "expected_hit": 0,
            "bust_chance": 0,
            "flip7_chance": 0,
            "safe_cards": 0,
            "bust_cards": 0,
            "reason": "No cards remain."
        }

    current_score = score_hand(my_cards)
    my_numbers = {int(card) for card in my_cards if card.isdigit()}

    expected_hit = 0
    bust_cards = 0
    safe_cards = 0
    flip7_probability = 0

    for card, count in deck.items():
        probability = count / total_cards

        if card.isdigit():
            number = int(card)

            if number in my_numbers:
                if has_second_chance:
                    outcome = current_score
                    safe_cards += count
                else:
                    outcome = 0
                    bust_cards += count
            else:
                new_cards = my_cards + [card]
                outcome = score_hand(new_cards)
                safe_cards += count

                new_numbers = my_numbers | {number}
                if len(new_numbers) >= 7:
                    flip7_probability += probability

        elif card in ["+2", "+4", "+6", "+8", "+10", "x2"]:
            outcome = score_hand(my_cards + [card])
            safe_cards += count

        else:
            outcome = current_score
            safe_cards += count

        expected_hit += outcome * probability

    risk_multiplier = {
        "Conservative": 0.90,
        "Normal": 1.00,
        "Aggressive": 1.12,
    }[risk_mode]

    adjusted_hit = expected_hit * risk_multiplier

    recommendation = "HIT" if adjusted_hit > current_score else "STAY"

    return {
        "recommendation": recommendation,
        "current_score": current_score,
        "expected_hit": round(expected_hit, 2),
        "bust_chance": round((bust_cards / total_cards) * 100, 1),
        "flip7_chance": round(flip7_probability * 100, 1),
        "safe_cards": safe_cards,
        "bust_cards": bust_cards,
        "cards_remaining": total_cards,
        "reason": "Hit has better expected value." if recommendation == "HIT" else "Staying is safer or better value."
    }


def add_card(area, card):
    if area == "mine":
        st.session_state.my_cards.append(card)
    else:
        st.session_state.visible_cards.append(card)


def remove_last(area):
    if area == "mine" and st.session_state.my_cards:
        st.session_state.my_cards.pop()
    if area == "visible" and st.session_state.visible_cards:
        st.session_state.visible_cards.pop()


def reset_round():
    st.session_state.my_cards = []
    st.session_state.visible_cards = []
    st.session_state.has_second_chance = False


if "my_cards" not in st.session_state:
    st.session_state.my_cards = []

if "visible_cards" not in st.session_state:
    st.session_state.visible_cards = []

if "has_second_chance" not in st.session_state:
    st.session_state.has_second_chance = False


st.title("🃏 Flip 7 Advisor")
st.caption("Tap cards as they appear. Get an instant Hit or Stay recommendation.")

risk_mode = st.segmented_control(
    "Play style",
    ["Conservative", "Normal", "Aggressive"],
    default="Normal"
)

st.divider()

st.subheader("Your active cards")

if st.session_state.my_cards:
    st.write(" ".join(f"`{card}`" for card in st.session_state.my_cards))
else:
    st.write("_No cards entered yet._")

cols = st.columns(4)

for index, card in enumerate(ALL_CARDS):
    with cols[index % 4]:
        if st.button(card, key=f"mine_{card}", use_container_width=True):
            add_card("mine", card)
            st.rerun()

col1, col2 = st.columns(2)

with col1:
    if st.button("Undo my card", use_container_width=True):
        remove_last("mine")
        st.rerun()

with col2:
    st.session_state.has_second_chance = st.checkbox(
        "I have Second Chance",
        value=st.session_state.has_second_chance
    )

st.divider()

st.subheader("Other visible / discarded cards")

if st.session_state.visible_cards:
    st.write(" ".join(f"`{card}`" for card in st.session_state.visible_cards))
else:
    st.write("_No visible used cards entered yet._")

cols = st.columns(4)

for index, card in enumerate(ALL_CARDS):
    with cols[index % 4]:
        if st.button(card, key=f"visible_{card}", use_container_width=True):
            add_card("visible", card)
            st.rerun()

if st.button("Undo visible card", use_container_width=True):
    remove_last("visible")
    st.rerun()

st.divider()

result = evaluate(
    st.session_state.my_cards,
    st.session_state.visible_cards,
    st.session_state.has_second_chance,
    risk_mode
)

if result["recommendation"] == "HIT":
    st.success("Recommendation: HIT")
else:
    st.warning("Recommendation: STAY")

st.metric("Current bank", result["current_score"])
st.metric("Expected value if hit", result["expected_hit"])
st.metric("Bust chance", f"{result['bust_chance']}%")
st.metric("Flip 7 chance", f"{result['flip7_chance']}%")

st.write(result["reason"])

with st.expander("Deck details"):
    st.write(f"Cards remaining: {result['cards_remaining']}")
    st.write(f"Safe cards remaining: {result['safe_cards']}")
    st.write(f"Bust cards remaining: {result['bust_cards']}")

st.divider()

if st.button("Reset round", type="primary", use_container_width=True):
    reset_round()
    st.rerun()